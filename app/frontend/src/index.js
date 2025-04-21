import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

const App = () => {
  const [message, setMessage] = useState('Loading...');
  const [effect, setEffect] = useState('');
  const [route, setRoute] = useState('');

  useEffect(() => {
    const path = window.location.pathname;
    const host = window.location.host;
    const cleanRoute = path.replace(/^\//, '');
    setRoute(cleanRoute);

    if (cleanRoute === 'cat') setEffect('cat-mode');
    else if (cleanRoute === 'dog') setEffect('dog-mode');
    else if (cleanRoute === 'space') setEffect('space-mode');
    else if (cleanRoute === 'party') setEffect('party-mode');
    else setEffect('default-mode');

    fetch(`/api/hello?domain=${host}&path=${path}`)
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(() => setMessage('Error loading message'));
  }, []);

  const links = ['cat', 'dog', 'space', 'party'];

  return (
    <div className={`wrapper ${effect}`}>
      <div className="content">
        <h1>{message}</h1>
        {route === '' ? (
          <ul className="nav-list">
            {links.map(link => (
              <li key={link}><a href={`/${link}`}>Hey dude! Click to the /{link}</a></li>
            ))}
          </ul>
        ) : (
          <a className="home-link" href="/">← Return to the home page</a>
        )}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
