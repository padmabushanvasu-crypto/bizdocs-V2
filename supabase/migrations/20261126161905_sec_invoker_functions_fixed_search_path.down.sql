do $$ declare r record; begin
  for r in select fn from public.z_sec_search_path_20261126 loop
    execute format('alter function %s reset search_path', r.fn);
  end loop; end $$;
