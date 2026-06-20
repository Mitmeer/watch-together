import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Room from './pages/Room.jsx';
import BackgroundCharacters from './components/BackgroundCharacters.jsx';

export default function App() {
  return (
    <div className="app">
      <BackgroundCharacters />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code?" element={<Room />} />
      </Routes>
    </div>
  );
}
