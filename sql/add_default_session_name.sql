-- Add default_session_name column to allow customizing the default session name ('매뉴얼PT')
ALTER TABLE systems ADD COLUMN default_session_name VARCHAR(255) DEFAULT '매뉴얼PT';
