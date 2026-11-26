do $$ declare t text; begin
  foreach t in array array['parties','invoices','invoice_line_items','grns','sale_backflush_lines','sale_shortfalls'] loop
    execute format($p$create policy "OLTC dashboard read" on public.%I for select to anon
                     using (company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'::uuid)$p$, t);
  end loop; end $$;
