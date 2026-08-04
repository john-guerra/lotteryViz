import React from "react";
import { Routes, Route } from "react-router-dom";
import { CourseProvider } from "./context/CourseContext";
import NavBar from "./components/NavBar";
import MainPage from "./pages/MainPage";
import AdminPage from "./pages/AdminPage";
import ParticipationPage from "./pages/ParticipationPage";
import "./App.css";

const App = () => (
  <div className="App">
    <CourseProvider>
      <NavBar />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/participation" element={<ParticipationPage />} />
      </Routes>
    </CourseProvider>
  </div>
);

export default App;
