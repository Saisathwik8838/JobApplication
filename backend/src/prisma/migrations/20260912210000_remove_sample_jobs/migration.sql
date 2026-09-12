-- Delete any legacy sample/fake jobs. Cascading foreign keys will remove associated applications and matches.
DELETE FROM "Job" WHERE LOWER("source") = 'sample';
