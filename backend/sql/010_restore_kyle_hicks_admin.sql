update app_user
set is_admin = true
where lower(username) = lower('kyle.hicks')
   or lower(email) in (
     lower('kyle.hicks'),
     lower('kyle.hicks@rfsim.local'),
     lower('kyle.hicks@rfsim.us'),
     lower('kyle.hicks@www.rfsim.us')
   );
