-- Seed de test : envoie un MAX de notifications au compte de Walid (test1, "Walid Bouzidane").
-- Interactions RÉELLES (amis/défis/messages → notifs auto via triggers) + notifs directes variées.
-- Réutilisable. Rejouable : les demandes d'ami sont dédupliquées ; le reste s'accumule.
-- Cible = b5fdcba1-74d0-458b-a0d4-1026bcac8145 (Walid / test1).

-- 1) Comptes test (🤖) — créés une fois. Pas de login : accepter/répondre ne spamme personne de réel.
insert into public.players (id, handle, display_name, elo)
values
  (gen_random_uuid(), 'testbot1', '🤖 Léo (test)',   1580),
  (gen_random_uuid(), 'testbot2', '🤖 Marie (test)', 1490),
  (gen_random_uuid(), 'testbot3', '🤖 Karim (test)', 1710),
  (gen_random_uuid(), 'testbot4', '🤖 Sofia (test)', 1350)
on conflict (handle) do nothing;

-- 2) Demandes d'ami (pending) → notif "friend_request" (trigger). Actionnables : tu peux accepter.
insert into public.friendships (requester, addressee, status)
select p.id, 'b5fdcba1-74d0-458b-a0d4-1026bcac8145'::uuid, 'pending'
from public.players p
where p.handle in ('testbot1', 'testbot2', 'testbot3', 'testbot4')
on conflict (requester, addressee) do nothing;

-- 3) Défis reçus (demandes de match) → notif "challenge" (trigger). Actionnables.
-- IMPORTANT : préciser un format bo3/bo5/bo7 (la colonne default = 'wtt', legacy, que new-match
-- ne verrouille PAS → sinon on peut re-modifier le format à la saisie du score).
insert into public.challenges (from_player, to_player, message, format)
select p.id, 'b5fdcba1-74d0-458b-a0d4-1026bcac8145'::uuid, v.msg, v.fmt
from (values
  ('testbot1', 'On se fait un match ce soir ?',   'bo5'),
  ('testbot3', 'Revanche, tu me dois ça 🏓',       'bo3'),
  ('testbot2', 'Dispo demain midi pour jouer ?',   'bo7'),
  ('testbot4', 'Un set rapide au Marais ?',        'bo5')
) as v(handle, msg, fmt)
join public.players p on p.handle = v.handle;

-- 4) Messages (DM) → notif "message" (trigger).
insert into public.messages (sender, recipient, body)
select p.id, 'b5fdcba1-74d0-458b-a0d4-1026bcac8145'::uuid, v.body
from (values
  ('testbot2', 'Salut Walid ! Bien joué hier 💪'),
  ('testbot4', 'Tu joues au Marais cette semaine ?'),
  ('testbot1', 'Ok pour 18h alors 👍'),
  ('testbot3', 'Ça te dit un entraînement demain ?')
) as v(handle, body)
join public.players p on p.handle = v.handle;

-- 5) Notifs directes variées (volume + variété d'icônes dans la liste).
insert into public.notifications (player_id, type, title, body)
values
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'slot',            'Nouveau créneau',      '🤖 Karim (test) propose un créneau à Charléty (aujourd''hui 19h).'),
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'slot',            'Nouveau créneau',      '🤖 Marie (test) propose un créneau au Marais (demain 14h).'),
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'tournament',      'Tournoi terminé',      '🤖 Léo (test) remporte le Tournoi du dimanche 🏆'),
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'friend_accepted', 'Demande acceptée 🎉',  '🤖 Sofia (test) a accepté ta demande.'),
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'session_like',    'Séance aimée',         '🤖 Karim (test) a aimé ta séance.'),
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'session_comment', 'Nouveau commentaire',  '🤖 Marie (test) a commenté ta séance : « Beau boulot ! »'),
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'friend_accepted', 'Demande acceptée 🎉',  '🤖 Léo (test) a accepté ta demande.'),
  ('b5fdcba1-74d0-458b-a0d4-1026bcac8145', 'tournament',      'Nouveau tournoi',      'Un tournoi « Mardi soir » vient d''être créé, rejoins-le !');

select 'notifs non lues pour Walid' as info, count(*) as n
from public.notifications
where player_id = 'b5fdcba1-74d0-458b-a0d4-1026bcac8145' and read = false;
