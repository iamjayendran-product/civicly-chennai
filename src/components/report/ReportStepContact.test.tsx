import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import { ReportStepContact } from './ReportStepContact';

describe('ReportStepContact', () => {
  it('collects name and phone', () => {
    const onChangeName = vi.fn();
    const onChangePhone = vi.fn();
    render(<ReportStepContact name="" phone="" onChangeName={onChangeName} onChangePhone={onChangePhone} />);
    fireEvent.change(screen.getByPlaceholderText(t('report.contact.namePlaceholder')), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByPlaceholderText(t('report.contact.phonePlaceholder')), { target: { value: '9876543210' } });
    expect(onChangeName).toHaveBeenCalledWith('Asha');
    expect(onChangePhone).toHaveBeenCalledWith('9876543210');
  });
});
