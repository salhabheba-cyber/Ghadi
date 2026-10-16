-- When a guardian is removed (e.g. account deletion) and a child has no guardian left, delete that child and,
-- via ON DELETE CASCADE, all of their learning data. Prevents orphaned children's data from lingering.
CREATE OR REPLACE FUNCTION delete_orphaned_child() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM child_guardians WHERE child_id = OLD.child_id) THEN
    DELETE FROM child_profiles WHERE id = OLD.child_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER child_guardians_orphan_cleanup
AFTER DELETE ON child_guardians
FOR EACH ROW EXECUTE FUNCTION delete_orphaned_child();
