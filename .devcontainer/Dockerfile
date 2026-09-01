FROM archlinux:latest

# Sync package database and install base tooling
# docker CLI (no daemon) lets `docker compose` talk to the host Podman socket
RUN pacman -Syu --noconfirm \
    && pacman -S --noconfirm --needed \
        base-devel \
        bash \
        ca-certificates \
        curl \
        docker \
        docker-compose \
        git \
        github-cli \
        make \
        openssh \
        procps-ng \
        sudo \
        unzip \
    && pacman -Scc --noconfirm

# Chromium runtime libraries for Playwright e2e tests. `playwright install-deps`
# only targets Debian/Ubuntu, so on Arch we install the shared libs Chromium
# links against ourselves (derived from `ldd chrome | grep "not found"`).
RUN pacman -Sy --noconfirm --needed \
        alsa-lib \
        at-spi2-core \
        atk \
        cairo \
        cups \
        libdrm \
        libx11 \
        libxcb \
        libxcomposite \
        libxdamage \
        libxext \
        libxfixes \
        libxkbcommon \
        libxrandr \
        mesa \
        nspr \
        nss \
        pango \
    && pacman -Scc --noconfirm

# Create a non-root user matching the host UID/GID (1000/1000 on SteamOS)
ARG USERNAME=dev
ARG USER_UID=1000
ARG USER_GID=1000
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/bash $USERNAME \
    && echo "$USERNAME ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
WORKDIR /home/$USERNAME

# Install mise (runtime version manager)
RUN curl https://mise.run | sh
ENV PATH="/home/$USERNAME/.local/bin:$PATH"

# Node 22.18.0 matches the repo's .nvmrc; pnpm 10.17.1 matches the
# "packageManager" field in package.json (activated via corepack).
RUN mise use --global node@22.18.0 \
    && mise exec -- corepack enable \
    && mise exec -- corepack prepare pnpm@10.17.1 --activate

RUN echo 'eval "$(mise activate bash)"' >> ~/.bashrc \
    && echo 'eval "$(mise activate bash)"' >> ~/.profile

ENV PATH="/home/$USERNAME/.local/share/mise/shims:$PATH"
