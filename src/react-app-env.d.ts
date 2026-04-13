/// <reference types="react-scripts" />

// Explicit declaration for CSS files (fixes the import error)
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}