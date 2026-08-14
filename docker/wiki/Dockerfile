# syntax=docker/dockerfile:1.4
# Wiki pages + theme baked into Otter Wiki. Settings DB is not copied.
# Base image user is www-data; listen port is 8080 (uwsgi).
# Otter base is digest-pinned (not the floating :2-slim tag). Keep
# technical-documentation/stack/wiki.md in lockstep with this FROM.
FROM redimp/otterwiki:2-slim@sha256:946e55ee7c5fb217743c4ab7d3fd4d5cab924491b7e79b6bb250126b9939e61f

USER root
COPY wiki/ /app-data/repository/
COPY wiki-assets/custom/custom.css wiki-assets/custom/custom.js /app/otterwiki/static/custom/

WORKDIR /app-data/repository
RUN git init -b main \
	&& git config user.email "wiki-bake@localhost" \
	&& git config user.name "wiki-bake" \
	&& git add -A \
	&& git commit -m "Baked wiki content" \
	&& git config --unset-all user.email \
	&& git config --unset-all user.name \
	&& chown -R www-data:www-data /app-data/repository \
	&& chmod -R a+rX /app-data/repository /app/otterwiki/static/custom \
	&& mkdir -p /app-data/db \
	&& chown www-data:www-data /app-data/db

WORKDIR /app
USER www-data
