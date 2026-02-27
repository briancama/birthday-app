-- Migration: Create user_favorite_songs table for music player favorites
-- Each user can have only one favorite song

create table if not exists user_favorite_songs (
  user_id uuid references users(id) on delete cascade primary key,
  song_id text not null
);
