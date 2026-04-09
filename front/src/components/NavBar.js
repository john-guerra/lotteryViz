import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const navbarStyles = `
.navbar-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1030;
}
.navbar-hidden {
  transform: translateY(-100%);
  transition: transform 0.2s ease-in-out;
}
.navbar-visible {
  transform: translateY(0);
  transition: transform 0.2s ease-in-out;
}
.navbar-trigger {
  height: 10px;
  width: 100%;
}
`;

function NavBar() {
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      <style>{navbarStyles}</style>
      <div
        className="navbar-container"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        <div className="navbar-trigger" />
        <nav
          className={`navbar navbar-expand-lg navbar-light bg-light ${
            isVisible ? "navbar-visible" : "navbar-hidden"
          }`}
        >
          <div className="container-fluid">
            <Link className="navbar-brand" to="/">
              Lottery
            </Link>
            <div className="navbar-nav">
              <Link
                className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
                to="/"
              >
                Main
              </Link>
              <Link
                className={`nav-link ${location.pathname === "/admin" ? "active" : ""}`}
                to="/admin"
              >
                Admin
              </Link>
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}

export default NavBar;
