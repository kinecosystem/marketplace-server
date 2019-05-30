pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                  git(
                       url: 'https://github.com/kinecosystem/marketplace-server.git',
                       branch: "${BRANCH}"
                   )
            }
        }
        stage('Create secrets for tests') {
            steps {
                sh 'STELLAR_ADDRESS=`aws --region=eu-west-1  ssm get-parameters --names /CI/Jenkins/STELLAR_ADDRESS --query Parameters[0].Value | tr -d \"\'`'
                echo 'Creating secrets for tests'
                echo "${STELLAR_ADDRESS}"
                sh 'mkdir -p ./secrets/ && echo export STELLAR_BASE_SEED=${STELLAR_BASE_SEED} STELLAR_ADDRESS=${STELLAR_ADDRESS} > ./secrets/.secrets'
            }
        }
        stage('Create-jwt-keys') {
            steps {
                echo 'Compiling'
                sh 'make create-jwt-keys'
            }
        }
        stage('Unit Test') {
            steps {
                echo 'Unit testing'
                echo 'Todo: place holder for unit tests'
            }
        }
        stage ('Code Quality'){
            steps {
                echo 'Todo: placeholder for codecov/sonarcube'
                echo 'Todo: Quality and security plugins (FindBugs, CheckMarx, etc.)'
            }
        }
        stage('Create Docker Image') {
            steps {
                echo 'Creating docker image'
                sh 'make build-image'
            }
        }
        stage('Create testing env') {
            steps {
                echo 'Creating env'

            }
        }
        stage('Deploy') {
            steps {
                echo 'Todo: Deploying env'
            }
        }
        stage('Integration/System tests') {
            steps {
                echo 'Todo: Testing'
            }
        }
    }
}
