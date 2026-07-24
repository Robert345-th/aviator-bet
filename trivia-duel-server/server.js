const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { getRandomQuestions } = require('./questions');
const { initDb, saveScore, getTopScores } = require('./db');

const QUESTION_TIME = 10; // seconds
const REVEAL_DELAY = 2500; // ms to show correct answer before next question
const QUESTIONS_PER_GAME = 8;

const app = express();
app.use(cors());
app.get('/', (req, res) => res.send('Trivia Duel server is running.'));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

app.get('/leaderboard', async (req, res) => {
  try {
    const rows = await getTopScores(10);
    res.json(rows);
  } catch (err) {
    console.error('Leaderboard fetch failed:', err.message);
    res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // code -> room object

function generateCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

function publicPlayers(room) {
  return room.players.map((p) => ({ name: p.name, score: p.score }));
}

function nextQuestion(room) {
  clearTimeout(room.timer);
  room.qIndex += 1;

  if (room.qIndex >= room.questions.length) {
    room.phase = 'result';
    io.to(room.code).emit('game_over', { players: publicPlayers(room) });

    room.players.forEach((p) => {
      saveScore(p.name, p.score).catch((err) =>
        console.error('Failed to save score:', err.message)
      );
    });
    return;
  }

  room.phase = 'question';
  room.questionStartedAt = Date.now();
  room.players.forEach((p) => {
    p.answeredThisQ = false;
    p.lastAnswer = null;
  });

  const q = room.questions[room.qIndex];
  io.to(room.code).emit('question', {
    index: room.qIndex,
    total: room.questions.length,
    question: q.q,
    options: q.options,
    timeLimit: QUESTION_TIME,
  });

  room.timer = setTimeout(() => revealQuestion(room), QUESTION_TIME * 1000);
}

function revealQuestion(room) {
  clearTimeout(room.timer);
  if (room.phase !== 'question') return;
  room.phase = 'reveal';

  const q = room.questions[room.qIndex];
  io.to(room.code).emit('reveal', {
    correctIndex: q.correct,
    players: room.players.map((p) => ({
      name: p.name,
      score: p.score,
      answer: p.lastAnswer,
    })),
  });

  room.timer = setTimeout(() => nextQuestion(room), REVEAL_DELAY);
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name }) => {
    const code = generateCode();
    const room = {
      code,
      players: [
        {
          socketId: socket.id,
          name: (name || 'Player 1').slice(0, 20),
          score: 0,
          answeredThisQ: false,
          lastAnswer: null,
        },
      ],
      questions: null,
      qIndex: -1,
      phase: 'waiting',
      timer: null,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.code = code;
    socket.emit('room_created', { code });
  });

  socket.on('join_room', ({ code, name }) => {
    const room = rooms.get(code);
    if (!room) {
      socket.emit('join_error', { message: 'Room not found. Check the code.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join_error', { message: 'Room is already full.' });
      return;
    }

    room.players.push({
      socketId: socket.id,
      name: (name || 'Player 2').slice(0, 20),
      score: 0,
      answeredThisQ: false,
      lastAnswer: null,
    });
    socket.join(code);
    socket.data.code = code;

    io.to(code).emit('player_joined', { players: publicPlayers(room) });

    // Both players present -> start the game
    room.questions = getRandomQuestions(QUESTIONS_PER_GAME);
    room.qIndex = -1;
    room.phase = 'starting';
    io.to(code).emit('game_starting', { players: publicPlayers(room) });

    setTimeout(() => nextQuestion(room), 2000);
  });

  socket.on('answer', ({ answerIndex }) => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room || room.phase !== 'question') return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player || player.answeredThisQ) return;

    const elapsed = (Date.now() - room.questionStartedAt) / 1000;
    const timeLeft = Math.max(0, QUESTION_TIME - elapsed);
    const q = room.questions[room.qIndex];
    const correct = answerIndex === q.correct;

    player.answeredThisQ = true;
    player.lastAnswer = { answerIndex, correct };
    if (correct) {
      player.score += Math.round(100 + timeLeft * 10);
    }

    const allAnswered = room.players.every((p) => p.answeredThisQ);
    if (allAnswered) {
      revealQuestion(room);
    }
  });

  socket.on('leave_room', () => {
    cleanupPlayer(socket);
  });

  socket.on('disconnect', () => {
    cleanupPlayer(socket);
  });

  function cleanupPlayer(sock) {
    const code = sock.data.code;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    room.players = room.players.filter((p) => p.socketId !== sock.id);

    if (room.players.length === 0) {
      clearTimeout(room.timer);
      rooms.delete(code);
    } else {
      clearTimeout(room.timer);
      io.to(code).emit('opponent_left');
      rooms.delete(code);
    }
  }
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Trivia Duel server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err.message);
    // Start the server anyway so gameplay still works without a leaderboard
    server.listen(PORT, () => {
      console.log(`Trivia Duel server listening on port ${PORT} (no DB)`);
    });
  });
