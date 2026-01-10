/**
 * Input component with enhanced styling
 */

import { forwardRef, InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth, className = '', ...props }, ref) => {
    const combinedClassName = [
      styles.input,
      error && styles.error,
      fullWidth && styles.fullWidth,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={styles.wrapper}>
        {label && <label className={styles.label}>{label}</label>}
        <input ref={ref} className={combinedClassName} {...props} />
        {error && <span className={styles.errorText}>{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
