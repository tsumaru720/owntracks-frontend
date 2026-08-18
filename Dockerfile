# Build stage - extract static-web-server binary
FROM ghcr.io/static-web-server/static-web-server:latest AS build

# Runtime stage
FROM alpine:latest

# Install jq and other necessary tools
RUN apk add --no-cache jq

# Create a new user called 'owntracks' with a home directory
RUN adduser -D -h /home/web web

# Set working directory
WORKDIR /home/web

# Copy static-web-server binary from build stage (root ownership is fine for executables)
COPY --from=build /static-web-server /static-web-server

# Copy entrypoint script to root
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create and set ownership of the public directory before copying files
RUN mkdir -p /home/web/public && chown web:web /home/web/public

# Switch to the web user
USER web

# Copy application files (directory already owned by web)
COPY app.js index.html styles.css /home/web/public/

# Set the entrypoint
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/static-web-server"]
