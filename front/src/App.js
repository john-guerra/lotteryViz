import React from "react";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import MainPage from "./pages/MainPage";
import AdminPage from "./pages/AdminPage";
import ParticipationPage from "./pages/ParticipationPage";
import "./App.css";

const App = () => (
  <div className="App">
    <NavBar />
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/participation" element={<ParticipationPage />} />
    </Routes>
  </div>
);

export default App;
