import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { listCourses, resolveCourseKey, COURSE_STORAGE_KEY } from "../courses.mjs";

const CourseContext = createContext(null);

// Unlike SelectionProvider (mounted inside AdminPage so brushed selection resets
// on navigation), this mounts above <Routes> so the course survives page moves,
// and mirrors to localStorage so it survives reloads.
export function CourseProvider({ children }) {
  const courses = useMemo(() => listCourses(), []);
  const keys = useMemo(() => courses.map((c) => c.key), [courses]);

  const [course, setCourse] = useState(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(COURSE_STORAGE_KEY);
    } catch {
      // Private browsing / storage disabled — fall through to the default.
    }
    return resolveCourseKey(stored, keys);
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(COURSE_STORAGE_KEY, course);
    } catch {
      // Non-fatal: the selection just won't survive a reload.
    }
  }, [course]);

  const value = useMemo(() => ({ course, setCourse, courses }), [course, courses]);

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

CourseProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useCourse() {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error("useCourse must be used within a CourseProvider");
  }
  return context;
}
