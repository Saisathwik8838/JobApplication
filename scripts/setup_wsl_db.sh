#!/bin/bash
/usr/sbin/service redis-server start
/usr/sbin/service postgresql start

su - postgres << 'PSQL_EOF'
psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jobagent') THEN CREATE ROLE jobagent WITH LOGIN SUPERUSER PASSWORD 'jobagent'; END IF; END \$\$;"
psql -c "SELECT 1 FROM pg_database WHERE datname = 'jobagent'" | grep -q 1 || psql -c "CREATE DATABASE jobagent OWNER jobagent;"
PSQL_EOF

sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/*/main/postgresql.conf
grep -q "0.0.0.0/0" /etc/postgresql/*/main/pg_hba.conf || echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/*/main/pg_hba.conf
grep -q "::0/0" /etc/postgresql/*/main/pg_hba.conf || echo "host all all ::0/0 md5" >> /etc/postgresql/*/main/pg_hba.conf

/usr/sbin/service postgresql restart
