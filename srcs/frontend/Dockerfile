FROM debian:11

RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get -y install nginx openssl

RUN rm -rf var/www/html/index.nginx-debian.html

COPY /src/. var/www/html/

COPY conf/nginx.conf /etc/nginx/sites-available/default

ENTRYPOINT ["bash", "/var/www/html/script.sh"]