import { Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Room from './pages/Room.jsx';
import BackgroundCharacters from './components/BackgroundCharacters.jsx';

export default function App() {
  const location = useLocation();
  const showCharacters = !location.pathname.startsWith('/room');

  return (
    <div className="app">
      {showCharacters && <BackgroundCharacters />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code?" element={<Room />} />
      </Routes>
    </div>
  );
}
