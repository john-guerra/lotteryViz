import { useState, useCallback, useMemo } from "react";
import * as d3 from "d3";

const ADJUSTMENT_FACTOR = 30;

export default function useLotteryEngine({ options, counts, optionsDrawn, setOptionSel }) {
  const [adjust, setAdjust] = useState(true);
  const [avoidRepetition, setAvoidRepetition] = useState(true);
  const [adjustByVariable, setAdjustByVariable] = useState("sum");

  // Build a hash of drawn names
  const drawnMap = useMemo(() => {
    const map = {};
    optionsDrawn.forEach((d) => (map[d.name] = true));
    return map;
  }, [optionsDrawn]);

  // Compute dCounts ensuring all options start at 0
  const dCounts = useMemo(() => {
    const map = new Map(
      options.map((d) => [d, { _id: d, count: 0, sum: 0 }])
    );
    for (const d of counts) {
      if (map.has(d._id)) {
        map.set(d._id, d);
      }
    }
    return map;
  }, [options, counts]);

  // Build the weighted options array from counts
  const getOptionsFromCounts = useCallback(() => {
    if (counts.length === 0) return options;

    const sortedCounts = Array.from(dCounts.values()).sort(
      (a, b) => a[adjustByVariable] - b[adjustByVariable]
    );

    const maxCount = sortedCounts.at(-1)[adjustByVariable];
    const adjustedCounts = sortedCounts.map((d) => ({
      ...d,
      adjustedCount: (maxCount - d[adjustByVariable]) * ADJUSTMENT_FACTOR + 1,
    }));

    return adjustedCounts
      .map((d) => Array.from({ length: d.adjustedCount }).map(() => d._id))
      .flat();
  }, [counts, options, dCounts, adjustByVariable]);

  // Build allOptions and optionsLeft
  const { allOptions, optionsLeft } = useMemo(() => {
    const source = adjust ? getOptionsFromCounts() : d3.shuffle([...options]);

    const all = source.map((d, i) => ({ name: d, id: i, drawn: false }));

    const left = avoidRepetition
      ? all.filter((d) => !drawnMap[d.name])
      : all;

    return { allOptions: all, optionsLeft: left };
  }, [adjust, getOptionsFromCounts, options, avoidRepetition, drawnMap]);

  // Build student data with probabilities for the bubble viz
  const students = useMemo(() => {
    // Count how many times each name appears in optionsLeft
    const nameWeights = {};
    for (const o of optionsLeft) {
      nameWeights[o.name] = (nameWeights[o.name] || 0) + 1;
    }
    const totalWeight = optionsLeft.length || 1;

    // Deduplicate: one entry per unique student name
    const seen = new Set();
    return allOptions
      .filter((o) => {
        if (seen.has(o.name)) return false;
        seen.add(o.name);
        return true;
      })
      .map((o) => {
        const c = dCounts.get(o.name) || { count: 0, sum: 0 };
        return {
          name: o.name,
          id: o.id,
          drawn: !!drawnMap[o.name],
          count: c.count,
          sum: c.sum,
          adjustedCount: nameWeights[o.name] || 0,
          probability: (nameWeights[o.name] || 0) / totalWeight,
        };
      });
  }, [allOptions, optionsLeft, dCounts, drawnMap]);

  const studentsLeft = useMemo(
    () => students.filter((s) => !s.drawn),
    [students]
  );

  // Choose a random student from the remaining pool
  const onChoose = useCallback(() => {
    if (optionsLeft.length === 0) {
      console.log("No more options left");
      alert("No more options left");
      return null;
    }

    const sel = Math.floor(Math.random() * optionsLeft.length);
    const chosen = optionsLeft[sel];
    chosen.drawn = true;

    setOptionSel(chosen);
    return chosen;
  }, [optionsLeft, setOptionSel]);

  const onAdjustByHistory = useCallback(
    (evt) => setAdjust(evt.target.checked),
    []
  );

  const onAdjustByVariable = useCallback(
    (evt) => setAdjustByVariable(evt.target.value),
    []
  );

  const onAvoidRepetition = useCallback(
    (evt) => setAvoidRepetition(evt.target.checked),
    []
  );

  return {
    adjust,
    avoidRepetition,
    adjustByVariable,
    students,
    studentsLeft,
    allOptions,
    optionsLeft,
    dCounts,
    drawnMap,
    onChoose,
    onAdjustByHistory,
    onAdjustByVariable,
    onAvoidRepetition,
  };
}
