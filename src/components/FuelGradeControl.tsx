import { FuelGrade } from '@/types';

const grades: { value: FuelGrade; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'midgrade', label: 'Midgrade' },
  { value: 'premium', label: 'Premium' },
  { value: 'diesel', label: 'Diesel' },
];

export function FuelGradeControl({ value, onChange }: {
  value: FuelGrade;
  onChange: (grade: FuelGrade) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="field-label mb-2">Fuel grade</legend>
      <div className="fuel-segments">
        {grades.map((grade) => (
          <button key={grade.value} type="button" aria-pressed={value === grade.value}
            onClick={() => onChange(grade.value)}>
            {grade.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
