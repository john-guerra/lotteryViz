import React, { createContext, useContext, useState, useCallback } from "react";

const SelectionContext = createContext(null);

export function SelectionProvider({ children }) {
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [highlightedStudent, setHighlightedStudent] = useState(null);

  const toggleStudent = useCallback((id) => {
    setSelectedStudents((prev) => {
      if (prev.includes(id)) {
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  }, []);

  const setSelectionFromBrush = useCallback((ids) => {
    setSelectedStudents(ids);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedStudents([]);
    setHighlightedStudent(null);
  }, []);

  return (
    <SelectionContext.Provider
      value={{
        selectedStudents,
        highlightedStudent,
        toggleStudent,
        setSelectionFromBrush,
        clearSelection,
        setHighlightedStudent,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}
