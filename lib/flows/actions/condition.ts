import { ActionHandler, ActionResult } from './index';

export const conditionAction: ActionHandler = async (config, input): Promise<ActionResult> => {
  // Condition logic is handled by the executor for branching
  // This handler just passes through the data
  const { field, operator, value } = config;
  
  const fieldValue = field?.split('.').reduce((obj: any, key: string) => obj?.[key], input);
  const result = evaluateCondition(fieldValue, operator, value);

  return {
    output: {
      condition: result,
      field,
      operator,
      value,
      actualValue: fieldValue,
      data: input,
    },
  };
};

function evaluateCondition(fieldValue: any, operator: string, compareValue: any): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === compareValue;
    case 'notEquals':
      return fieldValue !== compareValue;
    case 'contains':
      return String(fieldValue).includes(String(compareValue));
    case 'greaterThan':
      return Number(fieldValue) > Number(compareValue);
    case 'lessThan':
      return Number(fieldValue) < Number(compareValue);
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'notExists':
      return fieldValue === undefined || fieldValue === null;
    case 'isEmpty':
      return !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'isNotEmpty':
      return fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0);
    default:
      return Boolean(fieldValue);
  }
}
