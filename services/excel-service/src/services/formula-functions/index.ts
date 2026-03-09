import { formulaRegistry } from '../../utils/formula-registry.js';
import { mathTrigFunctions } from './math-trig.functions.js';
import { statisticalFunctions } from './statistical.functions.js';
import { statisticalAdvancedFunctions } from './statistical-advanced.functions.js';
import { lookupReferenceFunctions } from './lookup-reference.functions.js';
import { textFunctions } from './text.functions.js';
import { dateTimeFunctions } from './date-time.functions.js';
import { logicalFunctions } from './logical.functions.js';
import { financialFunctions } from './financial.functions.js';
import { informationFunctions } from './information.functions.js';
import { dynamicArrayFunctions } from './dynamic-array.functions.js';
import { databaseFunctions } from './database.functions.js';

/**
 * Register all formula functions in the global registry.
 * Call this once at startup.
 */
export function registerAllFormulas(): void {
  formulaRegistry.registerAll(mathTrigFunctions);
  formulaRegistry.registerAll(statisticalFunctions);
  formulaRegistry.registerAll(statisticalAdvancedFunctions);
  formulaRegistry.registerAll(lookupReferenceFunctions);
  formulaRegistry.registerAll(textFunctions);
  formulaRegistry.registerAll(dateTimeFunctions);
  formulaRegistry.registerAll(logicalFunctions);
  formulaRegistry.registerAll(financialFunctions);
  formulaRegistry.registerAll(informationFunctions);
  formulaRegistry.registerAll(dynamicArrayFunctions);
  formulaRegistry.registerAll(databaseFunctions);
}

// Auto-register on import
registerAllFormulas();

export {
  mathTrigFunctions,
  statisticalFunctions,
  statisticalAdvancedFunctions,
  lookupReferenceFunctions,
  textFunctions,
  dateTimeFunctions,
  logicalFunctions,
  financialFunctions,
  informationFunctions,
  dynamicArrayFunctions,
  databaseFunctions,
};
