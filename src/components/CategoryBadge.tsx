import React from 'react';
import { CategoryColorToken, CategoryConfig } from '../types/models';

export function resolveCategoryColor(
  categoryName: string,
  categories: CategoryConfig[]
): CategoryColorToken {
  const found = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  return found?.colorToken ?? 'slate';
}

interface CategoryBadgeProps {
  name: string;
  categories: CategoryConfig[];
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ name, categories }) => {
  const token = resolveCategoryColor(name, categories);
  return (
    <span className={`cat-pill cat-token--${token}`}>
      <span className="cat-dot" aria-hidden="true" />
      <span>{name}</span>
    </span>
  );
};
