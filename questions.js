// Shared worldwide question bank used by the server (authoritative source)
const QUESTIONS = [
  { q: 'What is the largest planet in our solar system?', options: ['Earth', 'Jupiter', 'Saturn', 'Mars'], correct: 1 },
  { q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], correct: 1 },
  { q: 'What is the chemical symbol for gold?', options: ['Gd', 'Au', 'Ag', 'Go'], correct: 1 },
  { q: 'How many players are on a football (soccer) team on the field?', options: ['9', '10', '11', '12'], correct: 2 },
  { q: 'What is the fastest land animal?', options: ['Lion', 'Cheetah', 'Horse', 'Leopard'], correct: 1 },
  { q: 'Which ocean is the largest in the world?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3 },
  { q: 'Who painted the Mona Lisa?', options: ['Van Gogh', 'Picasso', 'Da Vinci', 'Monet'], correct: 2 },
  { q: 'What is the capital of Japan?', options: ['Seoul', 'Beijing', 'Tokyo', 'Bangkok'], correct: 2 },
  { q: 'How many continents are there on Earth?', options: ['5', '6', '7', '8'], correct: 2 },
  { q: 'What gas do plants absorb from the atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], correct: 2 },
  { q: 'Which country is home to the Great Barrier Reef?', options: ['Brazil', 'Australia', 'Mexico', 'Thailand'], correct: 1 },
  { q: 'What is the smallest prime number?', options: ['0', '1', '2', '3'], correct: 2 },
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: 1 },
  { q: 'What is the currency used in Zambia?', options: ['Rand', 'Shilling', 'Kwacha', 'Naira'], correct: 2 },
  { q: 'How many minutes are in a full day?', options: ['1200', '1440', '1000', '1600'], correct: 1 },
  { q: 'Which element has the chemical symbol O?', options: ['Gold', 'Oxygen', 'Osmium', 'Silver'], correct: 1 },
  { q: 'What is the tallest mountain in the world?', options: ['K2', 'Kilimanjaro', 'Everest', 'Denali'], correct: 2 },
  { q: 'How many legs does a spider have?', options: ['6', '8', '10', '12'], correct: 1 },
  { q: 'What is the freezing point of water in Celsius?', options: ['0', '10', '-10', '32'], correct: 0 },
  { q: 'Which language has the most native speakers worldwide?', options: ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'], correct: 2 },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getRandomQuestions(count = 8) {
  return shuffle(QUESTIONS).slice(0, count);
}

module.exports = { QUESTIONS, getRandomQuestions };
