import type { ExtensionDefinition } from '../tool-context.js';
import { householdKnowledge } from './household-knowledge.js';
import { homeMaintenance } from './home-maintenance.js';
import { familyCalendar } from './family-calendar.js';
import { mealPlanning } from './meal-planning.js';
import { professionalCrm } from './professional-crm.js';
import { jobHunt } from './job-hunt.js';

/**
 * All available extensions, registered dynamically based on
 * which tables are present in a brain's schema.
 */
export const EXTENSIONS: ExtensionDefinition[] = [
  householdKnowledge,
  homeMaintenance,
  familyCalendar,
  mealPlanning,
  professionalCrm,
  jobHunt,
];
