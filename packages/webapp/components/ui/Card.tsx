/**
 * Card component with hover effects
 */

import { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  hover = false,
  padding = 'md',
  className = '',
  ...props
}: CardProps) {
  const combinedClassName = [
    styles.card,
    hover && styles.hover,
    styles[`padding-${padding}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={combinedClassName} {...props}>
      {children}
    </div>
  );
}
