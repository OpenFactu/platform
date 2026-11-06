# Keirost Messaging (Rust). Contexto de build: apps/messaging
# (ver docker-compose.yml). Las migraciones van dentro del binario
# (`sqlx::migrate!`), así que la imagen final es solo el ejecutable.

FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src

# Dependencias primero, para que una capa cacheada sobreviva a cambios del código.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src target/release/deps/keirost_messaging*

COPY src ./src
COPY migrations ./migrations
RUN cargo build --release --locked

FROM alpine:3
RUN addgroup -S keirost && adduser -S keirost -G keirost
COPY --from=build /src/target/release/keirost-messaging /usr/local/bin/keirost-messaging
USER keirost
ENV MESSAGING_HOST=0.0.0.0 MESSAGING_PORT=3100
EXPOSE 3100
CMD ["keirost-messaging"]
