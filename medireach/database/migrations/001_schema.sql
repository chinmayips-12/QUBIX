create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('patient', 'doctor', 'admin')),
  name text not null,
  email text unique,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_require_email_or_phone check (coalesce(email, '') <> '' or coalesce(phone, '') <> '')
);
alter table users alter column email drop not null;
alter table users add column if not exists phone text;
alter table users add column if not exists name text;
alter table users add column if not exists updated_at timestamptz not null default now();
create unique index if not exists users_phone_uq on users(phone) where phone is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_require_email_or_phone') then
    alter table users add constraint users_require_email_or_phone
      check (coalesce(email, '') <> '' or coalesce(phone, '') <> '');
  end if;
end $$;

create table if not exists patient_profiles (
  user_id uuid primary key references users on delete cascade,
  age int,
  address text,
  lat float8,
  lng float8,
  medical_info text
);
alter table patient_profiles add column if not exists medical_info text;

create table if not exists doctor_profiles (
  user_id uuid primary key references users on delete cascade,
  specialization text not null,
  custom_specialization text,
  qualification text,
  medical_college text,
  medical_council text,
  council_reg_no text,
  verified bool not null default false,
  verification_status text not null default 'Pending'
    check (verification_status in ('Pending', 'Verified', 'Requires Review/Rejected')),
  verification_note text,
  reviewed_by uuid references users,
  reviewed_at timestamptz,
  photo_file_id uuid,
  lat float8,
  lng float8
);
alter table doctor_profiles add column if not exists custom_specialization text;
alter table doctor_profiles add column if not exists medical_college text;
alter table doctor_profiles add column if not exists medical_council text;
alter table doctor_profiles add column if not exists council_reg_no text;
alter table doctor_profiles add column if not exists verification_status text not null default 'Pending';
alter table doctor_profiles add column if not exists verification_note text;
alter table doctor_profiles add column if not exists reviewed_by uuid references users;
alter table doctor_profiles add column if not exists reviewed_at timestamptz;
alter table doctor_profiles add column if not exists photo_file_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'doctor_profiles_verification_status_check') then
    alter table doctor_profiles add constraint doctor_profiles_verification_status_check
      check (verification_status in ('Pending', 'Verified', 'Requires Review/Rejected'));
  end if;
end $$;
create unique index if not exists doctor_profiles_council_reg_no_uq
  on doctor_profiles(council_reg_no) where council_reg_no is not null;

create table if not exists doctor_credentials (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references users on delete cascade,
  doc_type text not null,
  file_path text not null,
  document_sha256 text,
  status text not null default 'Pending'
    check (status in ('Pending', 'Verified', 'Requires Review/Rejected', 'pending', 'approved', 'rejected')),
  reviewed_by uuid references users,
  created_at timestamptz not null default now()
);
alter table doctor_credentials drop constraint if exists doctor_credentials_status_check;
alter table doctor_credentials add constraint doctor_credentials_status_check
  check (status in ('Pending', 'Verified', 'Requires Review/Rejected', 'pending', 'approved', 'rejected'));
alter table doctor_credentials add column if not exists document_sha256 text;
create unique index if not exists doctor_credentials_document_sha256_uq
  on doctor_credentials(document_sha256) where document_sha256 is not null;

create table if not exists doctor_availability (
  doctor_id uuid primary key references users on delete cascade,
  online bool not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists medical_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references users,
  doctor_id uuid references users,
  concern text not null,
  notes text,
  medical_info text,
  address text,
  lat float8,
  lng float8,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  is_emergency bool not null default false,
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'travelling', 'arrived', 'completed', 'cancelled')),
  location_updated_at timestamptz,
  accepted_at timestamptz,
  travel_alerted_at timestamptz,
  reassignments int not null default 0,
  created_at timestamptz not null default now()
);
alter table medical_requests add column if not exists medical_info text;
alter table medical_requests add column if not exists priority text not null default 'normal';
alter table medical_requests add column if not exists is_emergency bool not null default false;
alter table medical_requests add column if not exists location_updated_at timestamptz;
alter table medical_requests add column if not exists accepted_at timestamptz;
alter table medical_requests add column if not exists travel_alerted_at timestamptz;
alter table medical_requests add column if not exists reassignments int not null default 0;
do $$ begin
  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'medical_requests' and column_name = 'otp_hash') then
    execute 'revoke select (otp_hash) on medical_requests from anon, authenticated';
  end if;
end $$;

create table if not exists request_arrival_otps (
  request_id uuid primary key references medical_requests on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0 check (attempt_count between 0 and 5),
  created_at timestamptz not null default now()
);

create table if not exists request_status_history (
  id bigserial primary key,
  request_id uuid not null references medical_requests on delete cascade,
  status text not null,
  changed_by uuid references users,
  at timestamptz not null default now()
);

create table if not exists request_doctor_rejections (
  request_id uuid not null references medical_requests on delete cascade,
  doctor_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, doctor_id)
);

create table if not exists emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references users on delete cascade,
  name text not null,
  phone text not null,
  consent bool not null default false
);

create table if not exists private_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users on delete cascade,
  file_kind text not null check (file_kind in ('profile_photo', 'registration_certificate')),
  object_path text not null unique,
  mime_type text not null,
  file_sha256 text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists doctor_locations (
  request_id uuid primary key references medical_requests on delete cascade,
  doctor_id uuid not null references users on delete cascade,
  lat float8 not null,
  lng float8 not null,
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  body text not null,
  read bool not null default false,
  at timestamptz not null default now()
);

create table if not exists consultation_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references medical_requests,
  doctor_id uuid references users,
  patient_id uuid references users,
  summary text,
  fee numeric,
  at timestamptz not null default now()
);

create index if not exists medical_requests_patient_idx on medical_requests(patient_id);
create index if not exists medical_requests_doctor_idx on medical_requests(doctor_id);
create index if not exists medical_requests_status_idx on medical_requests(status);
create index if not exists doctor_profiles_specialization_verified_idx on doctor_profiles(specialization, verified);
create index if not exists emergency_contacts_patient_idx on emergency_contacts(patient_id);

create or replace function is_admin() returns bool
language sql stable security definer set search_path = public
as $$ select exists(select 1 from users where id = auth.uid() and role = 'admin') $$;

create or replace function is_verified_doctor() returns bool
language sql stable security definer set search_path = public
as $$ select exists(select 1 from doctor_profiles where user_id = auth.uid()
  and verified and verification_status = 'Verified') $$;

create or replace function is_eligible_doctor_for_request(p_request_id uuid) returns bool
language sql stable security definer set search_path = public
as $$ select exists(
  select 1 from medical_requests r
  join doctor_profiles d on d.user_id = auth.uid() and d.verified and d.verification_status = 'Verified'
  join doctor_availability a on a.doctor_id = d.user_id and a.online
  where r.id = p_request_id and r.status = 'submitted'
    and case r.concern
      when 'emergency' then d.specialization in ('General Physician', 'Emergency Medicine')
      when 'chest' then d.specialization in ('Cardiologist', 'Emergency Medicine')
      when 'breathing' then d.specialization in ('Pulmonologist', 'Emergency Medicine', 'General Physician')
      when 'fever' then d.specialization = 'General Physician'
      when 'injury' then d.specialization in ('Emergency Medicine', 'Orthopedist')
      else d.specialization = 'General Physician'
    end
) $$;

create or replace function is_request_party(request_id uuid) returns bool
language sql stable security definer set search_path = public
as $$ select exists(select 1 from medical_requests where id = request_id
  and (patient_id = auth.uid() or doctor_id = auth.uid())) $$;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'users', 'patient_profiles', 'doctor_profiles', 'doctor_credentials',
    'doctor_availability', 'medical_requests', 'request_arrival_otps',
    'request_status_history', 'request_doctor_rejections', 'emergency_contacts', 'private_files',
    'doctor_locations', 'notifications', 'consultation_history'
  ] loop
    execute format('alter table %I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists own_user on users;
drop policy if exists own_pp on patient_profiles;
drop policy if exists own_dp on doctor_profiles;
drop policy if exists pub_verified_dp on doctor_profiles;
drop policy if exists own_cred on doctor_credentials;
drop policy if exists own_av on doctor_availability;
drop policy if exists req_party on medical_requests;
drop policy if exists req_ins on medical_requests;
drop policy if exists hist_party on request_status_history;
drop policy if exists own_ec on emergency_contacts;
drop policy if exists own_n on notifications;
drop policy if exists own_ch on consultation_history;
drop policy if exists users_read_self_admin on users;
drop policy if exists patient_profiles_self_admin on patient_profiles;
drop policy if exists doctor_profiles_read_self_admin on doctor_profiles;
drop policy if exists doctor_profiles_read_verified on doctor_profiles;
drop policy if exists doctor_credentials_read_owner_admin on doctor_credentials;
drop policy if exists doctor_availability_read_self_admin on doctor_availability;
drop policy if exists doctor_availability_update_verified on doctor_availability;
drop policy if exists requests_read_parties_admin on medical_requests;
drop policy if exists requests_insert_patient on medical_requests;
drop policy if exists requests_history_party_admin on request_status_history;
drop policy if exists request_doctor_rejections_admin on request_doctor_rejections;
drop policy if exists emergency_contacts_owner_admin on emergency_contacts;
drop policy if exists private_files_owner_admin on private_files;
drop policy if exists doctor_locations_party_admin on doctor_locations;
drop policy if exists notifications_owner_admin on notifications;
drop policy if exists consultation_history_party_admin on consultation_history;

create policy users_read_self_admin on users for select using (id = auth.uid() or is_admin());
create policy patient_profiles_self_admin on patient_profiles for all using (user_id = auth.uid() or is_admin());
create policy doctor_profiles_read_self_admin on doctor_profiles for select using (user_id = auth.uid() or is_admin());
create policy doctor_profiles_read_verified on doctor_profiles for select using (verified and verification_status = 'Verified');
create policy doctor_credentials_read_owner_admin on doctor_credentials for select using (doctor_id = auth.uid() or is_admin());
create policy doctor_availability_read_self_admin on doctor_availability for select using (doctor_id = auth.uid() or is_admin());
create policy doctor_availability_update_verified on doctor_availability for all
  using (doctor_id = auth.uid() or is_admin())
  with check (doctor_id = auth.uid() and (not online or is_verified_doctor()) or is_admin());
create policy requests_read_parties_admin on medical_requests for select
  using (patient_id = auth.uid() or doctor_id = auth.uid() or is_admin()
    or (status = 'submitted' and is_eligible_doctor_for_request(id)));
create policy requests_insert_patient on medical_requests for insert with check (patient_id = auth.uid());
create policy requests_history_party_admin on request_status_history for select
  using (is_request_party(request_id) or is_admin());
create policy request_doctor_rejections_admin on request_doctor_rejections for select using (is_admin());
create policy emergency_contacts_owner_admin on emergency_contacts for all
  using (patient_id = auth.uid() or is_admin())
  with check (patient_id = auth.uid() or is_admin());
create policy private_files_owner_admin on private_files for select using (owner_id = auth.uid() or is_admin());
create policy private_files_verified_photo on private_files for select using (
  file_kind = 'profile_photo' and exists(
    select 1 from doctor_profiles d where d.user_id = private_files.owner_id
      and d.verified and d.verification_status = 'Verified'
  )
);
create policy doctor_locations_party_admin on doctor_locations for select using (is_request_party(request_id) or is_admin());
create policy notifications_owner_admin on notifications for all
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());
create policy consultation_history_party_admin on consultation_history for select
  using (patient_id = auth.uid() or doctor_id = auth.uid() or is_admin());

-- Arrival OTPs have no authenticated read policy; verify and disclose only through the trusted backend.
-- Request acceptance must be atomic in the trusted backend: update only where status = 'submitted'.
