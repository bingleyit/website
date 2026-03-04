FROM nginx:alpine
COPY . /usr/share/nginx/html

# Replace default nginx config to listen on Railway's $PORT
RUN printf 'server {\n  listen $PORT;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' > /etc/nginx/templates/default.conf.template

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
