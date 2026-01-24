import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';  // Matchers
import App from './App';

test('renders Politicker header and ZIP input', () => {
  render(<App />);
  const headerElement = screen.getByText(/Politicker/i);
  expect(headerElement).toBeInTheDocument();

  const inputElement = screen.getByPlaceholderText(/Enter ZIP code/i);
  expect(inputElement).toBeInTheDocument();
});