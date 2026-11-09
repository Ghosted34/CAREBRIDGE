import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NumberField, PasswordField } from './ui';

const PasswordHarness = () => {
  const [value, setValue] = useState('hunter2');
  return <PasswordField value={value} onValueChange={setValue} aria-label="Password" />;
};

const NumberHarness = () => {
  const [digits, setDigits] = useState('25000');
  return (
    <NumberField
      value={digits}
      onValueChange={setDigits}
      max={10_000_000}
      aria-label="Amount (NGN)"
    />
  );
};

describe('PasswordField', () => {
  it('hides the value until the toggle is pressed', async () => {
    render(<PasswordHarness />);
    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show' });
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('keeps typing while the value is visible', async () => {
    render(<PasswordHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    await userEvent.type(screen.getByLabelText('Password'), '!');
    expect(screen.getByLabelText('Password')).toHaveValue('hunter2!');
  });
});

describe('NumberField', () => {
  it('is a text input with a numeric keypad, so no browser spinners', () => {
    render(<NumberHarness />);
    const input = screen.getByLabelText('Amount (NGN)');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('groups digits in threes and drops everything that is not a digit', async () => {
    render(<NumberHarness />);
    const input = screen.getByLabelText('Amount (NGN)');
    expect(input).toHaveValue('25,000');

    await userEvent.clear(input);
    await userEvent.type(input, '1a2b34,56');
    expect(input).toHaveValue('123,456');
  });

  it('flags an amount above the ceiling', async () => {
    render(<NumberHarness />);
    const input = screen.getByLabelText('Amount (NGN)');
    await userEvent.clear(input);
    await userEvent.type(input, '99999999');
    expect(input).toHaveValue('99,999,999');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('can be emptied, which the caller turns into an invalid form', async () => {
    render(<NumberHarness />);
    const input = screen.getByLabelText('Amount (NGN)');
    await userEvent.clear(input);
    expect(input).toHaveValue('');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});
