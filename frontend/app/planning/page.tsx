import type { Metadata } from 'next';
import { Planning } from '@/components/planning/Planning';
import './planning.css';

export const metadata: Metadata = { title: 'Planning · ProductPilot' };

export default function PlanningPage() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600&display=swap" precedence="default" />
      <Planning />
    </>
  );
}
