const CHARACTERS = [
  {
    name: 'Mortis',
    series: 'Brawl Stars',
    className: 'char-mortis',
    image: '/characters/mortis.png',
    position: { top: '5%', left: '2%' },
  },
  {
    name: 'Angelo',
    series: 'Brawl Stars',
    className: 'char-angelo',
    image: '/characters/angelo.png',
    position: { top: '12%', right: '2%' },
  },
  {
    name: 'Mellstroy',
    series: '',
    className: 'char-mellstroy',
    image: '/characters/mellstroy.png',
    position: { bottom: '8%', left: '3%' },
  },
  {
    name: 'Taksa',
    series: '',
    className: 'char-taksa',
    image: '/characters/taksa.png',
    position: { bottom: '15%', right: '4%' },
  },
  {
    name: 'Lelouch',
    series: 'Code Geass',
    className: 'char-lelouch',
    image: '/characters/lelouch.png',
    position: { bottom: '12%', left: '36%' },
  },
  {
    name: 'C.C.',
    series: 'Code Geass',
    className: 'char-cc',
    image: '/characters/cc.png',
    position: { bottom: '12%', left: '50%' },
  },
  {
    name: 'Сириус',
    series: 'Brawl Stars',
    className: 'char-sirius',
    image: '/characters/sirius.png',
    position: { top: '28%', left: '62%' },
  },
];

export default function BackgroundCharacters() {
  return (
    <div className="bg-characters" aria-hidden="true">
      <div className="bg-gradient" />
      {CHARACTERS.map((char) => (
        <div
          key={char.name}
          className={`character-card ${char.className}`}
          style={char.position}
        >
          <img
            src={char.image}
            alt=""
            className="character-image"
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextElementSibling?.classList.add('visible');
            }}
          />
          <div className="character-fallback">
            <span className="character-emoji">
              {char.className === 'char-mortis' && '🦇'}
              {char.className === 'char-angelo' && '💗'}
              {char.className === 'char-mellstroy' && '🔥'}
              {char.className === 'char-taksa' && '🐕'}
              {char.className === 'char-lelouch' && '👑'}
              {char.className === 'char-cc' && '🍕'}
              {char.className === 'char-sirius' && '🌙'}
            </span>
          </div>
          <div className="character-label">
            <span className="character-name">{char.name}</span>
            {char.series && <span className="character-series">{char.series}</span>}
          </div>
        </div>
      ))}
      <div className="bg-particles" />
    </div>
  );
}
