-- Compras da fatura aberta (PENDING na Pluggy) entram na caixa de entrada
-- marcadas; provider_id reconhece a mesma compra quando o banco confirma.
alter table public.transacoes_banco add column pendente_banco boolean not null default false;
alter table public.transacoes_banco add column provider_id text;
comment on column public.transacoes_banco.pendente_banco is 'Compra da fatura aberta (PENDING na Pluggy); vira false quando o banco confirma.';
comment on column public.transacoes_banco.provider_id is 'Id da transação na instituição (providerId da Pluggy, Open Finance): o único estável quando a compra passa de pendente a confirmada.';
create index transacoes_banco_conta_data_idx on public.transacoes_banco (conta_banco_id, data);
