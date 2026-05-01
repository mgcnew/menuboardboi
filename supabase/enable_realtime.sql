-- Habilita o Realtime para as tabelas do projeto
-- Isso permite que a TV receba atualizações instantâneas sem precisar recarregar a página
alter publication supabase_realtime add table companies;
alter publication supabase_realtime add table images;
alter publication supabase_realtime add table music;
alter publication supabase_realtime add table voiceovers;