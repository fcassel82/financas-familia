-- Chave de acesso (44 dígitos) da nota fiscal: identifica a nota sem ambiguidade,
-- para a mesma nota não ser lançada duas vezes. Opcional: as notas já gravadas
-- e as importadas sem QR Code ficam sem ela.
alter table public.notas_fiscais
  add column chave_acesso text check (chave_acesso ~ '^\d{44}$');
create unique index notas_fiscais_chave_acesso_key
  on public.notas_fiscais (chave_acesso) where chave_acesso is not null;
comment on column public.notas_fiscais.chave_acesso is 'Chave de acesso da NF-e/NFC-e (44 dígitos), lida do QR Code ou do DANFE.';

-- Para desfazer: alter table public.notas_fiscais drop column chave_acesso;
