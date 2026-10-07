// Crew distance line under the crew total. Re-space `from` each year to fit that crew's pace.
export const FEET_PER_STEP = 2.5;

// `from` = crew total steps where the line takes over; `feet` = length of one thing.
export const DISTANCE_BANDS = [
  { from: 1, feet: 1 / 12, text: "Over {n} candy corns, end to end." },
  { from: 600000, feet: 7 / 12, text: "Enough to fit over {n} vampire bats, wingtip to wingtip." },
  { from: 800000, feet: 1.5, text: "Ask the Ouija board: over {n} of them, end to end." },
  { from: 1000000, feet: 8, text: "We’ve walked over {n} graves." },
  { from: 1200000, feet: 20, text: "You could roll the world’s biggest pumpkin over {n} times." },
  // Quarter mile
  {
    from: 1400000,
    feet: 1320,
    text: "Michael Myers would need over {n} slow chases to catch us.",
  },
  // One hour at 1 mph
  { from: 1600000, feet: 5280, text: "A zombie would need over {n} hours to catch up." },
  // Two miles
  { from: 1800000, feet: 10560, text: "We’ve made it out of over {n} corn mazes." },
  // 15 hours at 2.5 mph
  {
    from: 2000000,
    feet: 198000,
    text: "That’s {n} days of walking in circles and ending up back at camp.",
  },
];
