-- Add achievement for completing the GifStepper
BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES
  ('gif_master', 'GIF Master', 'Complete the animated GIF stepper', 1, '{"trigger":"gif:completed"}')
ON CONFLICT (key) DO NOTHING;

COMMIT;
