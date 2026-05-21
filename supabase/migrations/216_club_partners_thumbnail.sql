  -- 216: club_partners.thumbnail_url
  -- 각 MD는 같은 클럽이라도 본인만의 대표 이미지를 가질 수 있음.
  -- clubs.thumbnail_url (admin 전용) 과는 완전히 무관.

  ALTER TABLE club_partners
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
