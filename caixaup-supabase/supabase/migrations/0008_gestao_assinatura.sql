begin;

create or replace function public.alterar_cancelamento_assinatura(p_cancelar boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare empresa uuid := public.usuario_empresa_id(); registro public.assinaturas;
begin
  if empresa is null then raise exception 'Sessão inválida'; end if;
  update public.assinaturas
    set cancel_at_period_end = p_cancelar, updated_at = now()
    where empresa_id = empresa
    returning * into registro;
  if not found then raise exception 'Assinatura não encontrada'; end if;
  insert into public.auditoria(empresa_id, usuario_id, entidade, registro_id, acao, motivo, depois)
    values(empresa, auth.uid(), 'assinaturas', empresa, case when p_cancelar then 'cancelar_renovacao' else 'reativar_renovacao' end,
      'Alteração realizada pelo titular da conta', jsonb_build_object('cancel_at_period_end', p_cancelar));
  return jsonb_build_object('cancelAtPeriodEnd', registro.cancel_at_period_end, 'updatedAt', registro.updated_at);
end;
$$;

revoke all on function public.alterar_cancelamento_assinatura(boolean) from public, anon;
grant execute on function public.alterar_cancelamento_assinatura(boolean) to authenticated;

commit;
