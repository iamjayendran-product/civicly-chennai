import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import { ReportStepContact, type ReportStepContactProps } from './ReportStepContact';

function renderStep(overrides: Partial<ReportStepContactProps> = {}) {
  const props: ReportStepContactProps = {
    name: '',
    phone: '',
    gender: null,
    onChangeName: vi.fn(),
    onChangePhone: vi.fn(),
    onChangeGender: vi.fn(),
    ...overrides,
  };
  render(<ReportStepContact {...props} />);
  return props;
}

describe('ReportStepContact', () => {
  it('collects name and phone', () => {
    const props = renderStep();
    fireEvent.change(screen.getByPlaceholderText(t('report.contact.namePlaceholder')), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByPlaceholderText(t('report.contact.phonePlaceholder')), { target: { value: '9876543210' } });
    expect(props.onChangeName).toHaveBeenCalledWith('Asha');
    expect(props.onChangePhone).toHaveBeenCalledWith('9876543210');
  });

  it('asks for gender with GCC’s three options', () => {
    const props = renderStep();
    expect(screen.getByRole('radiogroup', { name: t('report.contact.gender') })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: t('report.contact.gender.transgender') }));
    expect(props.onChangeGender).toHaveBeenCalledWith('transgender');
  });

  it('marks the chosen gender', () => {
    renderStep({ gender: 'female' });
    expect(screen.getByRole('radio', { name: t('report.contact.gender.female') })).toBeChecked();
  });

  it('does not mention GCC', () => {
    renderStep();
    expect(screen.queryByText(/GCC|Corporation/)).not.toBeInTheDocument();
  });
});
