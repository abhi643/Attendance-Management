import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
// import './index.css';


function App() {
  return (
    <Router>
      <div className="App">
        <ToastContainer />
        <Routes>
          <Route exact path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;