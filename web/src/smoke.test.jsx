import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

test('Testing Library renders into jsdom', () => {
  render(<button>ok</button>);
  expect(screen.getByRole('button', { name: 'ok' })).toBeTruthy();
});
