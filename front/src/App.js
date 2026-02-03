import React from "react";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import MainPage from "./pages/MainPage";
import AdminPage from "./pages/AdminPage";
import "./App.css";

const App = () => (
  <div className="App">
    <NavBar />
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  </div>
);

export default App;
