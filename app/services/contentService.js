const catalog = [
  {
    id: "bluey-001",
    title: "Bluey - Keepy Uppy",
    type: "cartoon",
    ageRating: "G",
    durationMinutes: 7
  },
  {
    id: "octonauts-001",
    title: "Octonauts - The Whale Shark",
    type: "cartoon",
    ageRating: "G",
    durationMinutes: 12
  },
  {
    id: "storybots-001",
    title: "StoryBots - Why Is the Sky Blue?",
    type: "educational",
    ageRating: "G",
    durationMinutes: 24
  }
];

export function listContent() {
  return catalog;
}

export function findContent(contentId) {
  return catalog.find((item) => item.id === contentId) || null;
}
