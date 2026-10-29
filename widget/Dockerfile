FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
RUN printf 'server { listen 3001; location = / { root /usr/share/nginx/html; try_files /index.html =404; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 3001
