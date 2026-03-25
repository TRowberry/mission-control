-- Get AgentFlow schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'AgentFlow' 
ORDER BY ordinal_position;

-- Get AgentFlowRun schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'AgentFlowRun' 
ORDER BY ordinal_position;

-- Get ActionType schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'ActionType' 
ORDER BY ordinal_position;
